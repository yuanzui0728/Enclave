import { useEffect, useState } from "react";
import {
  dismissActiveMiniProgram,
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

  useEffect(() => {
    writeMiniProgramsState(state);
  }, [state]);

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
