import { useEffect, useState } from "react";
import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  dismissActiveMiniProgram,
  hydrateMiniProgramsStateFromNative,
  markMiniProgramOpened,
  recordGroupRelayPublish,
  readMiniProgramsState,
  toggleMiniProgramTaskCompletion,
  togglePinnedMiniProgram,
  writeMiniProgramsState,
  type MiniProgramsStoredState,
} from "./mini-programs-storage";

export function useMiniProgramsState() {
  const [state, setState] = useState<MiniProgramsStoredState>(() =>
    readMiniProgramsState(),
  );
  const [stateReady, setStateReady] = useState(!isDesktopRuntimeAvailable());

  useEffect(() => {
    let cancelled = false;

    async function hydrateState() {
      const hydratedState = await hydrateMiniProgramsStateFromNative();
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
      writeMiniProgramsState(state, {
        syncNative: false,
      });
      return;
    }

    writeMiniProgramsState(state);
  }, [state, stateReady]);

  return {
    ...state,
    openMiniProgram(miniProgramId: string) {
      setState((current) => markMiniProgramOpened(current, miniProgramId));
    },
    togglePinned(miniProgramId: string) {
      setState((current) => togglePinnedMiniProgram(current, miniProgramId));
    },
    toggleTaskCompletion(miniProgramId: string, taskId: string) {
      setState((current) =>
        toggleMiniProgramTaskCompletion(current, {
          miniProgramId,
          taskId,
        }),
      );
    },
    dismissActiveMiniProgram() {
      setState((current) => dismissActiveMiniProgram(current));
    },
    recordGroupRelayPublish(sourceGroupId: string) {
      setState((current) => recordGroupRelayPublish(current, sourceGroupId));
    },
  };
}
