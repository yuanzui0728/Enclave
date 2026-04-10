import { useEffect, useState } from "react";
import {
  dismissActiveMiniProgram,
  markMiniProgramOpened,
  readMiniProgramsState,
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
    dismissActiveMiniProgram() {
      setState((current) => dismissActiveMiniProgram(current));
    },
  };
}
