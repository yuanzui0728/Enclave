import { lazy, Suspense, type ComponentType } from "react";

// 内嵌小游戏统一注册表：把 gameId 映射到一个支持 onExit 的 React 组件。
// games-page.tsx 与 desktop-games-workspace.tsx 都从这里查表渲染，
// 避免每加一款游戏都要在两处各 if-else 一遍。
//
// 注意：yinjie-farm 走独立路由（/tabs/games/yinjie-farm），不在这里注册。

const ParkingWarGame = lazy(async () => {
  const mod = await import("./parking-war/parking-war-game");
  return { default: mod.ParkingWarGame };
});

const SignalSquadGame = lazy(async () => {
  const mod = await import("./signal-squad/signal-squad-game");
  return { default: mod.SignalSquadGame };
});

const NightMarketGame = lazy(async () => {
  const mod = await import("./night-market/night-market-game");
  return { default: mod.NightMarketGame };
});

const SkyRallyGame = lazy(async () => {
  const mod = await import("./sky-rally/sky-rally-game");
  return { default: mod.SkyRallyGame };
});

const CatInnGame = lazy(async () => {
  const mod = await import("./cat-inn/cat-inn-game");
  return { default: mod.CatInnGame };
});

const ForestTrainGame = lazy(async () => {
  const mod = await import("./forest-train/forest-train-game");
  return { default: mod.ForestTrainGame };
});

const PixelArenaGame = lazy(async () => {
  const mod = await import("./pixel-arena/pixel-arena-game");
  return { default: mod.PixelArenaGame };
});

const CloudFarmGame = lazy(async () => {
  const mod = await import("./cloud-farm/cloud-farm-game");
  return { default: mod.CloudFarmGame };
});

const IslandConcertGame = lazy(async () => {
  const mod = await import("./island-concert/island-concert-game");
  return { default: mod.IslandConcertGame };
});

const TankWarGame = lazy(async () => {
  const mod = await import("./tank-war/tank-war-game");
  return { default: mod.TankWarGame };
});

export type EmbeddedGameProps = {
  variant?: "embedded" | "fullscreen";
  onExit?: () => void;
};

const EMBEDDED_GAME_COMPONENTS: Record<
  string,
  ComponentType<EmbeddedGameProps>
> = {
  "parking-war": ParkingWarGame,
  "signal-squad": SignalSquadGame,
  "night-market": NightMarketGame,
  "sky-rally": SkyRallyGame,
  "cat-inn": CatInnGame,
  "forest-train": ForestTrainGame,
  "pixel-arena": PixelArenaGame,
  "cloud-farm": CloudFarmGame,
  "island-concert": IslandConcertGame,
  "tank-war": TankWarGame,
};

export function hasEmbeddedGame(gameId: string | null | undefined): boolean {
  if (!gameId) return false;
  return gameId in EMBEDDED_GAME_COMPONENTS;
}

type EmbeddedGameSlotProps = {
  gameId: string;
  onExit: () => void;
  fallback?: React.ReactNode;
};

export function EmbeddedGameSlot({
  gameId,
  onExit,
  fallback = null,
}: EmbeddedGameSlotProps) {
  const Game = EMBEDDED_GAME_COMPONENTS[gameId];
  if (!Game) return null;
  return (
    <Suspense fallback={fallback}>
      <Game variant="embedded" onExit={onExit} />
    </Suspense>
  );
}
