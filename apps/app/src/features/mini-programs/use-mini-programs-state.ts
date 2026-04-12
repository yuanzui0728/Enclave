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

function areMiniProgramsStatesEqual(
  left: MiniProgramsStoredState,
  right: MiniProgramsStoredState,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

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

      setState((current) =>
        areMiniProgramsStatesEqual(current, hydratedState)
          ? current
          : hydratedState,
      );
      setStateReady(true);
    }

    void hydrateState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDesktopRuntimeAvailable()) {
      return;
    }

    let cancelled = false;

    async function syncStateFromNative() {
      const hydratedState = await hydrateMiniProgramsStateFromNative();
      if (cancelled) {
        return;
      }

      setState((current) =>
        areMiniProgramsStatesEqual(current, hydratedState)
          ? current
          : hydratedState,
      );
    }

    const handleFocus = () => {
      void syncStateFromNative();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncStateFromNative();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
