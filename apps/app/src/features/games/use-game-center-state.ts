import { useEffect, useState } from "react";
import {
  dismissActiveGame,
  markGameOpened,
  readGameCenterState,
  togglePinnedGame,
  writeGameCenterState,
  type GameCenterStoredState,
} from "./game-center-storage";

export function useGameCenterState() {
  const [state, setState] = useState<GameCenterStoredState>(() =>
    readGameCenterState(),
  );

  useEffect(() => {
    writeGameCenterState(state);
  }, [state]);

  return {
    ...state,
    launchGame(gameId: string) {
      setState((current) => markGameOpened(current, gameId));
    },
    togglePinned(gameId: string) {
      setState((current) => togglePinnedGame(current, gameId));
    },
    dismissActiveGame() {
      setState((current) => dismissActiveGame(current));
    },
  };
}
