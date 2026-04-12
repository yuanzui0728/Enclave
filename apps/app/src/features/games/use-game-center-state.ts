import { useEffect, useState } from "react";
import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  dismissActiveGame,
  hydrateGameCenterStateFromNative,
  markGameCenterEventAction,
  markGameCenterInviteDelivered,
  markGameCenterFriendInvite,
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
  const [stateReady, setStateReady] = useState(!isDesktopRuntimeAvailable());

  useEffect(() => {
    let cancelled = false;

    async function hydrateState() {
      const hydratedState = await hydrateGameCenterStateFromNative();
      if (cancelled) {
        return;
      }

      setState(hydratedState);
      setStateReady(true);
    }

    void hydrateState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!stateReady && isDesktopRuntimeAvailable()) {
      writeGameCenterState(state, {
        syncNative: false,
      });
      return;
    }

    writeGameCenterState(state);
  }, [state, stateReady]);

  return {
    ...state,
    launchGame(gameId: string) {
      setState((current) => markGameOpened(current, gameId));
    },
    togglePinned(gameId: string) {
      setState((current) => togglePinnedGame(current, gameId));
    },
    applyEventAction(eventId: string, status: string) {
      setState((current) =>
        markGameCenterEventAction(current, {
          eventId,
          status,
        }),
      );
    },
    applyFriendInvite(activityId: string, status: string) {
      setState((current) =>
        markGameCenterFriendInvite(current, {
          activityId,
          status,
        }),
      );
    },
    markInviteDelivered(
      activityId: string,
      conversationId: string,
      conversationPath: string,
      conversationTitle: string,
    ) {
      setState((current) =>
        markGameCenterInviteDelivered(current, {
          activityId,
          conversationId,
          conversationPath,
          conversationTitle,
        }),
      );
    },
    dismissActiveGame() {
      setState((current) => dismissActiveGame(current));
    },
  };
}
